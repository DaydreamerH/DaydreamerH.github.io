add_executable(06_coordinate_systems strange_box.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(06_coordinate_systems PRIVATE glfw opengl32)
endif()

foreach(FILE_NAME coordinate.vs coordinate.fs)
    add_custom_command(TARGET 06_coordinate_systems POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:06_coordinate_systems>/${FILE_NAME}"
    )
endforeach()

foreach(IMG_FILE wall.jpg awesomeface.png)
    add_custom_command(TARGET 06_coordinate_systems POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/images/${IMG_FILE}"
        "$<TARGET_FILE_DIR:06_coordinate_systems>/${IMG_FILE}"
    )
endforeach()