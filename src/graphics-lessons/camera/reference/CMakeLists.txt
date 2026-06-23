add_executable(07_camera camera_control.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(07_camera glfw opengl32)
endif()

foreach(FILE_NAME camera.vs camera.fs)
    add_custom_command(TARGET 07_camera POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:07_camera>/${FILE_NAME}"
    )
endforeach()

foreach(IMG_FILE wall.jpg awesomeface.png)
    add_custom_command(TARGET 07_camera POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/images/${IMG_FILE}"
        "$<TARGET_FILE_DIR:07_camera>/${IMG_FILE}"
    )
endforeach()