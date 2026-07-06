add_executable(13_multiple_lights main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(13_multiple_lights glfw opengl32)
endif()

foreach(FILE_NAME cube.vs cube.fs light.vs light.fs)
    add_custom_command(TARGET 13_multiple_lights POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:13_multiple_lights>/${FILE_NAME}"
    )
endforeach()

foreach(IMG_FILE container.png container_specular.png)
    add_custom_command(TARGET 13_multiple_lights POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/images/${IMG_FILE}"
        "$<TARGET_FILE_DIR:13_multiple_lights>/${IMG_FILE}"
    )
endforeach()